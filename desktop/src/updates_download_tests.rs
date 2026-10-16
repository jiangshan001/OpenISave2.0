use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tauri_plugin_updater::UpdaterExt;

const FIXTURE: &[u8] = include_bytes!("../tests/fixtures/update-check.txt");
const SIGNATURE: &str = include_str!("../tests/fixtures/update-check.txt.sig");

fn server(version: &str, body: Vec<u8>, requests: usize) -> (String, std::thread::JoinHandle<()>) {
    let socket = TcpListener::bind("127.0.0.1:0").unwrap();
    socket.set_nonblocking(true).unwrap();
    let origin = format!("http://{}", socket.local_addr().unwrap());
    let manifest = serde_json::json!({"version":version, "notes":"Test only", "platforms":{
        "windows-x86_64":{"url":format!("{origin}/installer"), "signature":SIGNATURE.trim()}
    }})
    .to_string();
    let thread = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut served = 0;
        while served < requests && Instant::now() < deadline {
            let Ok((mut stream, _)) = socket.accept() else {
                std::thread::sleep(Duration::from_millis(5));
                continue;
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut header = Vec::new();
            let mut byte = [0_u8];
            while !header.ends_with(b"\r\n\r\n") && header.len() < 8192 {
                if stream.read(&mut byte).unwrap_or(0) == 0 {
                    break;
                }
                header.push(byte[0]);
            }
            let payload = if header.starts_with(b"GET /latest.json ") {
                manifest.as_bytes()
            } else {
                &body
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                payload.len()
            )
            .unwrap();
            stream.write_all(payload).unwrap();
            served += 1;
        }
    });
    (format!("{origin}/latest.json"), thread)
}

fn app() -> tauri::App<tauri::test::MockRuntime> {
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().identifier = "com.openisave.updater.tests".into();
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({
            "pubkey":include_str!("../updater.pub").trim(), "requireSignedVersion":true,
            "windows":{"installMode":"passive"}
        }),
    );
    tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap()
}

fn download(version: &str, bytes: Vec<u8>) -> Result<Vec<u8>, tauri_plugin_updater::Error> {
    let (endpoint, thread) = server(version, bytes, 2);
    let app = app();
    let total = AtomicUsize::new(0);
    let result = tauri::async_runtime::block_on(async {
        let update = app
            .updater_builder()
            .no_proxy()
            .endpoints(vec![endpoint.parse().unwrap()])
            .unwrap()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap()
            .check()
            .await?
            .unwrap();
        update
            .download(
                |chunk, _| {
                    total.fetch_add(chunk, Ordering::Relaxed);
                },
                || {},
            )
            .await
    });
    thread.join().unwrap();
    assert!(total.load(Ordering::Relaxed) > 0);
    result
}

#[test]
fn downloads_and_verifies_with_the_real_embedded_signing_identity() {
    assert_eq!(download("2.4.4", FIXTURE.to_vec()).unwrap(), FIXTURE);
}

#[test]
fn refuses_tampered_bytes_before_an_installer_can_run() {
    assert!(download("2.4.4", b"tampered payload".to_vec()).is_err());
}

#[test]
fn refuses_a_manifest_version_that_does_not_match_the_signed_version() {
    assert!(download("2.4.5", FIXTURE.to_vec()).is_err());
}

#[test]
fn does_not_offer_an_older_release() {
    let (endpoint, thread) = server("0.0.1", FIXTURE.to_vec(), 1);
    let app = app();
    let result = tauri::async_runtime::block_on(
        app.updater_builder()
            .no_proxy()
            .endpoints(vec![endpoint.parse().unwrap()])
            .unwrap()
            .build()
            .unwrap()
            .check(),
    )
    .unwrap();
    assert!(result.is_none());
    thread.join().unwrap();
}

#[test]
#[ignore = "Downloads the published installer; run only after publishing this version"]
fn verifies_published_signed_installer() {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let endpoint = config["plugins"]["updater"]["endpoints"][0]
        .as_str()
        .unwrap();
    let app = app();
    tauri::async_runtime::block_on(async {
        let mut update = app
            .updater_builder()
            .endpoints(vec![endpoint.parse().unwrap()])
            .unwrap()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap()
            .check()
            .await
            .expect("Public update manifest must be reachable")
            .expect("Published release must be newer than the isolated mock app");
        assert_eq!(update.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(
            update.download_url.as_str(),
            format!(
                "https://github.com/jiangshan001/OpenISave2.0/releases/download/v{0}/OpenISave_{0}_x64-setup.exe",
                env!("CARGO_PKG_VERSION")
            )
        );
        update.timeout = Some(Duration::from_secs(15 * 60));
        let bytes = update
            .download(|_, _| {}, || {})
            .await
            .expect("Public installer signature and signed version must verify");
        assert!(bytes.starts_with(b"MZ"));
        println!(
            "Published {}: downloaded and verified {} bytes; installer was not executed",
            update.version,
            bytes.len()
        );
    });
}
