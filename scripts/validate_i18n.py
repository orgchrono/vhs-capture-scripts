import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from scripts.i18n.validator import validate_locale_parity


def main() -> int:
    print("[*] Verifying translation key parity across all 10 locales...")
    discrepancies = validate_locale_parity("pt-BR")

    if not discrepancies:
        print("[+] 100% parity verified: all 10 locales contain identical key structures.")
        return 0

    print("[!] Parity violations found:", file=sys.stderr)
    for loc, missing_keys in discrepancies.items():
        print(f"  - {loc}: {len(missing_keys)} missing key(s):", file=sys.stderr)
        for k in missing_keys[:10]:
            print(f"      * {k}", file=sys.stderr)
        if len(missing_keys) > 10:
            print(f"      ... and {len(missing_keys) - 10} more", file=sys.stderr)

    return 1


if __name__ == "__main__":
    sys.exit(main())
