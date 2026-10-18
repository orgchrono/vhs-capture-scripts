"""
packaging.py - Archival packaging and digital preservation standards module.
Generates BagIt structures and PREMIS v3 XML preservation metadata with canonical fixity.
"""

import os
import xml.etree.ElementTree as ET
import shutil
from vhs_studio.core.media_utils import compute_sha256


class Packaging:
    """Archival packaging utilities for BagIt and PREMIS digital preservation."""

    @staticmethod
    def create_bagit(directory: str) -> bool:
        """Structure target directory following the BagIt specification (RFC 8493)."""
        if not os.path.exists(directory):
            return False

        data_dir = os.path.join(directory, "data")
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
            for item in os.listdir(directory):
                if item == "data":
                    continue
                shutil.move(os.path.join(directory, item), os.path.join(data_dir, item))

        bagit_txt = os.path.join(directory, "bagit.txt")
        with open(bagit_txt, "w", encoding="utf-8") as f:
            f.write("BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n")

        manifest_txt = os.path.join(directory, "manifest-sha256.txt")
        with open(manifest_txt, "w", encoding="utf-8") as f:
            for root, _, files in os.walk(data_dir):
                for file in files:
                    filepath = os.path.join(root, file)
                    rel_path = os.path.relpath(filepath, directory).replace("\\", "/")
                    digest = compute_sha256(filepath)
                    f.write(f"{digest} {rel_path}\n")
        return True

    @staticmethod
    def generate_premis(filepath: str) -> str:
        """Generate PREMIS v3 preservation metadata for archival masters."""
        if not os.path.exists(filepath):
            return ""

        size = os.path.getsize(filepath)
        hexdigest = compute_sha256(filepath)

        premis = ET.Element(
            "premis", xmlns="http://www.loc.gov/premis/v3", version="3.0"
        )
        obj = ET.SubElement(premis, "object", {"xsi:type": "file"})

        id_elem = ET.SubElement(obj, "objectIdentifier")
        ET.SubElement(id_elem, "objectIdentifierType").text = "local"
        ET.SubElement(id_elem, "objectIdentifierValue").text = os.path.basename(
            filepath
        )

        chars = ET.SubElement(obj, "objectCharacteristics")
        ET.SubElement(chars, "size").text = str(size)

        fixity = ET.SubElement(chars, "fixity")
        ET.SubElement(fixity, "messageDigestAlgorithm").text = "SHA-256"
        ET.SubElement(fixity, "messageDigest").text = hexdigest

        orig = ET.SubElement(obj, "originalName")
        orig.text = os.path.basename(filepath)

        xml_str = ET.tostring(premis, encoding="utf-8", method="xml").decode("utf-8")

        premis_path = f"{filepath}.premis.xml"
        with open(premis_path, "w", encoding="utf-8") as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
            f.write(xml_str)

        return premis_path
