"""MAC OUI → vendor lookup.

A small embedded table of the most common NIC vendors we'd see on gaming PCs.
For the long tail, this returns None and the panel falls back to the SMBIOS
manufacturer string instead.

To extend: add the first 6 hex chars (no separator, uppercase) of the OUI.
Full IEEE OUI database is ~30k entries; we cover the ~80 most common.
"""

# Common OUI prefixes (first 24 bits of MAC) → vendor
_OUI = {
    # Realtek (very common on consumer motherboards)
    "00E04C": "Realtek", "001E58": "Realtek", "002522": "Realtek",
    "5404A6": "Realtek", "BC5FF4": "Realtek", "5C260A": "Realtek",
    # Intel
    "001CC0": "Intel", "001E67": "Intel", "00A0C9": "Intel", "0015F2": "Intel",
    "0040AE": "Intel", "001302": "Intel", "001731": "Intel", "001AA0": "Intel",
    "00224D": "Intel", "002354": "Intel", "AC7BA1": "Intel", "8C1645": "Intel",
    "B4969A": "Intel", "F8B156": "Intel", "F8E43B": "Intel",
    # Killer / Qualcomm Atheros (gaming NICs)
    "0017F2": "Qualcomm Atheros", "0030B4": "Qualcomm Atheros",
    "C8D3FF": "Killer / Qualcomm", "F09FC2": "Killer / Qualcomm",
    # Broadcom
    "00904C": "Broadcom", "001018": "Broadcom", "00100A": "Broadcom",
    # Aquantia / Marvell (10G)
    "00179A": "Aquantia", "00179B": "Aquantia",
    # ASRock
    "70854D": "ASRock", "BC5FF4": "ASRock",
    # ASUS
    "00248C": "ASUS", "001A92": "ASUS", "BCAEC5": "ASUS",
    "9C5C8E": "ASUS", "AC22B": "ASUS", "C87F54": "ASUS",
    # MSI
    "001517": "MSI", "001731": "MSI", "B083FE": "MSI",
    "70F395": "MSI", "0019D1": "MSI",
    # Gigabyte
    "001FD0": "Gigabyte", "002522": "Gigabyte", "1869DA": "Gigabyte",
    "B42E99": "Gigabyte", "5404A6": "Gigabyte",
    # Apple (in case someone PXE boots a Mac)
    "001451": "Apple", "001451": "Apple", "F0DBF8": "Apple",
    # VMware (test VMs)
    "000C29": "VMware", "005056": "VMware", "001C14": "VMware",
    # QEMU / KVM
    "525400": "QEMU/KVM",
    # VirtualBox
    "080027": "VirtualBox",
    # Microsoft (Hyper-V)
    "0003FF": "Microsoft", "001DD8": "Microsoft", "00155D": "Microsoft Hyper-V",
}


def lookup(mac: str) -> str | None:
    """Return vendor name from MAC address, or None if unknown.

    Accepts MAC in any standard format (with/without colons/hyphens, any case).
    """
    if not mac:
        return None
    clean = mac.replace(":", "").replace("-", "").replace(".", "").upper()
    if len(clean) < 6:
        return None
    return _OUI.get(clean[:6])
