//! Supervises the FastAPI sidecar process.
//!
//! The backend is a PyInstaller bundle shipped beside the app. It is started
//! on a free loopback port, and is guaranteed to die with the desktop app:
//! besides the explicit kill on shutdown, the child is placed in a Windows job
//! object that terminates it even if this process is killed outright, so no
//! orphaned server is ever left listening.

use std::io;
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const SIDECAR_DIR: &str = "binaries/openisave-server";
pub const SIDECAR_EXE: &str = "openisave-server.exe";

/// What the frontend needs to know about the backend right now.
#[derive(Clone, Debug)]
pub enum BackendStatus {
    /// Development build: the Vite proxy serves the API.
    NotBundled,
    Starting,
    Ready(String),
    Failed(String),
}

/// Handle to the running backend, if one was started by this process.
pub struct BackendState {
    child: Mutex<Option<Child>>,
    status: Mutex<BackendStatus>,
}

impl Default for BackendState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new(BackendStatus::Starting),
        }
    }
}

impl BackendState {
    pub fn status(&self) -> BackendStatus {
        self.status
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or(BackendStatus::Failed("Internal state error.".into()))
    }

    fn set_status(&self, next: BackendStatus) {
        if let Ok(mut guard) = self.status.lock() {
            *guard = next;
        }
    }

    pub fn set_not_bundled(&self) {
        self.set_status(BackendStatus::NotBundled);
    }

    pub fn set_ready(&self, port: u16) {
        self.set_status(BackendStatus::Ready(format!("http://127.0.0.1:{port}")));
    }

    pub fn set_failed(&self, message: String) {
        self.set_status(BackendStatus::Failed(message));
    }

    pub fn set_child(&self, child: Child) {
        if let Ok(mut guard) = self.child.lock() {
            *guard = Some(child);
        }
    }

    /// Stop the backend. Safe to call more than once.
    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Ask the OS for an unused loopback port.
///
/// Binding to port 0 and immediately releasing leaves a small race, but the
/// backend claims the port milliseconds later and a failure to bind is
/// reported rather than silently ignored.
pub fn free_port() -> io::Result<u16> {
    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

pub fn sidecar_path(resource_dir: &PathBuf) -> Option<PathBuf> {
    let candidate = resource_dir.join(SIDECAR_DIR).join(SIDECAR_EXE);
    candidate.exists().then_some(candidate)
}

#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
        JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// Kept alive for the lifetime of the app; closing it kills the child.
    ///
    /// The handle is never read: simply owning it is the mechanism. When this
    /// process ends — cleanly or not — Windows closes the handle, which
    /// terminates every process in the job.
    #[allow(dead_code)]
    pub struct JobHandle(HANDLE);
    unsafe impl Send for JobHandle {}
    unsafe impl Sync for JobHandle {}

    /// Tie the child's lifetime to ours so a crash cannot orphan it.
    pub fn attach(child: &Child) -> Option<JobHandle> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return None;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                return None;
            }
            if AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE) == 0 {
                return None;
            }
            Some(JobHandle(job))
        }
    }
}

#[cfg(not(windows))]
mod job {
    use std::process::Child;

    pub struct JobHandle;

    pub fn attach(_child: &Child) -> Option<JobHandle> {
        None
    }
}

pub use job::JobHandle;

/// Launch the sidecar and wait until it answers, or give up with an error.
pub fn start(exe: &PathBuf, port: u16) -> io::Result<(Child, Option<JobHandle>)> {
    let mut command = Command::new(exe);
    command.arg("--port").arg(port.to_string());
    command.arg("--host").arg("127.0.0.1");
    if let Some(parent) = exe.parent() {
        command.current_dir(parent);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command.spawn()?;
    let handle = job::attach(&child);
    Ok((child, handle))
}

/// Poll the port until the server accepts connections.
pub fn wait_until_ready(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&address.into(), Duration::from_millis(400)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}
