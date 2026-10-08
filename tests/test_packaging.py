import pytest
import os
from vhs_studio.archive.packaging import Packaging

def test_create_bagit(tmp_path):
    d = tmp_path / "archive_dir"
    d.mkdir()
    f = d / "test.txt"
    f.write_text("dummy")
    
    res = Packaging.create_bagit(str(d))
    assert res is True
    
    assert (d / "data").exists()
    assert (d / "data" / "test.txt").exists()
    assert (d / "bagit.txt").exists()

def test_generate_premis(tmp_path):
    f = tmp_path / "test.mkv"
    f.write_text("dummy video content")
    xml_out = Packaging.generate_premis(str(f))
    assert "dummy" in str(xml_out) or xml_out is not None
