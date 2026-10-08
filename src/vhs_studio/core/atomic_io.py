"""Module documentation pending."""
import os
import hashlib
import json


class AtomicIO:
    """Documentation for AtomicIO."""
    @staticmethod
    def generate_hash(params_dict):
        """Gera um hash curto para diferenciar saídas com parâmetros de filtros diferentes."""
        param_str = json.dumps(params_dict, sort_keys=True).encode("utf-8")
        return hashlib.sha256(param_str).hexdigest()[:8]

    @staticmethod
    def get_part_path(final_path):
        """Documentation for get_part_path."""
        return final_path + ".part"

    @staticmethod
    def commit_file(part_path, final_path):
        """Move o arquivo .part para o destino final atomicamente."""
        if os.path.exists(part_path):
            if os.path.exists(final_path):
                os.remove(final_path)
            os.rename(part_path, final_path)
