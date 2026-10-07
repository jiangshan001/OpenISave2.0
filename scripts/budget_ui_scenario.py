"""Select Budget smoke-test scenarios in the named synthetic scratch vault only.

Start a memory-key backend with OPENISAVE_DATA_ROOT set to
%TEMP%/openisave-budget-ui-20261004/data, seed with ui_review_fixture.py,
then run this script with overall-only, combined, category-only or empty.
Never reads or writes a production vault.
"""
import argparse
from datetime import date
from pathlib import Path
import tempfile

import ui_review_fixture

# The original fixture accepts an API URL in argv[1]; this script's argv[1]
# is a scenario name, so pin the API explicitly before making any request.
ui_review_fixture.API = "http://127.0.0.1:8756/api/v1"
call = ui_review_fixture.call


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("scenario", choices=["overall-only", "combined", "category-only", "empty"])
    args = parser.parse_args()
    expected = Path(tempfile.gettempdir()) / "openisave-budget-ui-20261004" / "data"
    actual = Path(call("GET", "/security/status")["data_location"])
    if actual.resolve() != expected.resolve():
        raise SystemExit("Refusing: backend is not using the named Budget UI scratch vault.")
    today = date.today()
    path = f"/budgets/{today.year}/{today.month}"
    categories = {row["name"]: row["id"] for row in call("GET", "/categories?kind=expense")
                  if row["parent_id"] is None}
    entries = []
    if args.scenario in {"combined", "category-only"}:
        entries = [{"category_id": categories[name], "amount_minor": amount} for name, amount in
                   [("Food", 400_000), ("Transport", 300_000), ("Lifestyle", 200_000), ("Housing", 500_000)]]
    call("PUT", path, {"entries": entries})
    call("PATCH", path + "/overall", {"overall_limit_minor":
         1_500_000 if args.scenario in {"overall-only", "combined"} else None})
    print(f"Synthetic Budget scenario ready: {args.scenario}.")


if __name__ == "__main__":
    main()
