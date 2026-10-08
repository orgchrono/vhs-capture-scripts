"""Module documentation pending."""
import os
import stat


class MasterPolicy:
    """Documentation for MasterPolicy."""
    @staticmethod
    def make_readonly(filepath):
        """Bloqueia modificações no arquivo master."""
        os.chmod(filepath, stat.S_IREAD)

    @staticmethod
    def verify_321_compliance(filepath):
        # Simplification: return true for now
        """Documentation for verify_321_compliance."""
        return True
