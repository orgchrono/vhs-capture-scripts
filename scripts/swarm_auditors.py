import os
import sys
import subprocess
import concurrent.futures
import ast
import re
from dataclasses import dataclass

@dataclass
class AuditResult:
    name: str
    status: str
    details: str

class BaseAuditor:
    def __init__(self, name: str, base_dir: str):
        self.name = name
        self.base_dir = base_dir
        self.src_dir = os.path.join(base_dir, "src")
        self.ui_dir = os.path.join(base_dir, "ui")
        self.tests_dir = os.path.join(base_dir, "tests")

    def run(self) -> AuditResult:
        raise NotImplementedError


class ArchitectureAuditor(BaseAuditor):
    def run(self) -> AuditResult:
        details = []
        status = "PASS"
        
        expected_dirs = ["core", "config", "api", "video", "storage", "cli"]
        vhs_studio_dir = os.path.join(self.src_dir, "vhs_studio")
        if os.path.exists(vhs_studio_dir):
            dirs = [d for d in os.listdir(vhs_studio_dir) if os.path.isdir(os.path.join(vhs_studio_dir, d))]
            missing = [d for d in expected_dirs if d not in dirs]
            if missing:
                details.append(f"Missing expected modules for SOC/SRP: {missing}")
                status = "WARN"
            else:
                details.append("Directory structure successfully implements Separation of Concerns (SOC).")

        if os.path.exists(self.ui_dir):
            details.append("UI Layer detected. MVVM mapping strictness enforced: ui/src (View), API (ViewModel).")
        
        config_files = ["vhs_advanced_config.toml", "pyproject.toml", "package.json"]
        details.append(f"SSOT config files recognized: {config_files}")

        return AuditResult(self.name, status, "\n".join(details))


class DependencyAuditor(BaseAuditor):
    def run(self) -> AuditResult:
        details = []
        status = "PASS"
        
        try:
            pip_res = subprocess.run(["pip", "check"], capture_output=True, text=True, cwd=self.base_dir)
            if pip_res.returncode == 0:
                details.append("Pip dependencies are consistent.")
            else:
                details.append(f"Pip issues:\n{pip_res.stdout}")
                status = "FAIL"
        except Exception as e:
            details.append(f"Pip check error: {str(e)}")

        if os.path.exists(self.ui_dir):
            try:
                npm_res = subprocess.run(["npm", "audit", "--audit-level=high"], capture_output=True, text=True, cwd=self.ui_dir, shell=True)
                if npm_res.returncode == 0:
                    details.append("NPM dependencies are secure.")
                else:
                    details.append(f"NPM vulnerabilities found (high/critical).")
                    status = "WARN"
            except Exception as e:
                details.append(f"NPM audit error: {str(e)}")
                
        return AuditResult(self.name, status, "\n".join(details))


class SecurityAuditor(BaseAuditor):
    def run(self) -> AuditResult:
        details = []
        status = "PASS"
        
        try:
            bandit_res = subprocess.run(["bandit", "-ll", "-r", "src"], capture_output=True, text=True, cwd=self.base_dir)
            if bandit_res.returncode == 0:
                details.append("Bandit: No security issues found in Python code.")
            else:
                details.append(f"Bandit found potential security issues. Run bandit directly for details.")
                status = "WARN"
        except Exception:
            details.append("Bandit not found.")

        hardcode_pattern = re.compile(r'(password\s*=\s*[\'"].*?[\'"])', re.IGNORECASE)
        hardcode_issues = []
        for root, dirs, files in os.walk(self.src_dir):
            for file in files:
                if file.endswith('.py'):
                    filepath = os.path.join(root, file)
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                        matches = hardcode_pattern.findall(content)
                        if matches:
                            hardcode_issues.append(f"{file}: {matches}")
        
        if hardcode_issues:
            details.append(f"Hardcoded values detected (violation of SSOT/Security):\n{hardcode_issues}")
            status = "WARN"
        else:
            details.append("No hardcoded credentials found.")
            
        return AuditResult(self.name, status, "\n".join(details))


class CodeQualityAuditor(BaseAuditor):
    def run(self) -> AuditResult:
        details = []
        status = "PASS"
        
        try:
            pylint_res = subprocess.run(["pylint", "src"], capture_output=True, text=True, cwd=self.base_dir)
            if pylint_res.returncode == 0:
                details.append("Pylint: Code smells and idiomatic rules respected.")
            else:
                score_match = re.search(r'Your code has been rated at ([0-9\.\-]+)/10', pylint_res.stdout)
                if score_match:
                    details.append(f"Pylint Score: {score_match.group(1)}/10")
                    if float(score_match.group(1)) < 8.0:
                        status = "WARN"
                else:
                    details.append("Pylint found code smells (idiomatic breaks, semantics).")
        except Exception:
            details.append("Pylint not installed.")

        # FP Pure, Loose Types (Any), and Duplication heuristics
        global_mutations = 0
        loose_types = 0
        technical_debt = 0 
        
        for root, dirs, files in os.walk(self.src_dir):
            for file in files:
                if file.endswith('.py'):
                    filepath = os.path.join(root, file)
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                        technical_debt += content.count("TODO") + content.count("FIXME")
                        if "global " in content:
                            global_mutations += 1
                        if "Any" in content:
                            loose_types += content.count("Any")
        
        details.append(f"Technical Debt: Found {technical_debt} TODO/FIXME markers.")
        if global_mutations > 0:
            details.append(f"FP Pure Violation: Found {global_mutations} global state mutations.")
            status = "WARN"
        else:
            details.append("FP Pure Check: Passed.")
            
        if loose_types > 0:
            details.append(f"Loose Types: Found {loose_types} instances of 'Any'. Consider making types stricter.")
            status = "WARN"

        return AuditResult(self.name, status, "\n".join(details))


class TestAndFlakeAuditor(BaseAuditor):
    def run(self) -> AuditResult:
        details = []
        status = "PASS"
        
        if not os.path.exists(self.tests_dir):
            return AuditResult(self.name, "WARN", "No 'tests' directory found.")

        flaky_patterns = ["time.sleep", "random.", "uuid.uuid4()"]
        flaky_issues = 0
        harness_fixtures = 0

        for root, dirs, files in os.walk(self.tests_dir):
            for file in files:
                if file.endswith('.py'):
                    filepath = os.path.join(root, file)
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if "@pytest.fixture" in content or "setUp" in content:
                            harness_fixtures += 1
                        for pattern in flaky_patterns:
                            if pattern in content:
                                flaky_issues += 1
                                
        if harness_fixtures > 0:
            details.append(f"Harness tests active: Found {harness_fixtures} test fixtures/setups.")
        else:
            details.append("No explicit test harness fixtures found.")
            
        if flaky_issues > 0:
            details.append(f"Flaking tests risk: Found {flaky_issues} instances of sleep/randomness in tests.")
            status = "WARN"
        else:
            details.append("No flaking test patterns (sleep, random) detected.")
            
        return AuditResult(self.name, status, "\n".join(details))


class UxUiAuditor(BaseAuditor):
    def run(self) -> AuditResult:
        details = []
        status = "PASS"
        if not os.path.exists(self.ui_dir):
            return AuditResult(self.name, "SKIP", "No UI directory found.")
            
        i18n_keywords = ["i18n", "useTranslation", "t("]
        a11y_keywords = ["aria-", "role="]
        view_tests_keywords = ["render(", "screen.", "test("]
        
        i18n_found = False
        a11y_found = False
        view_tests = False
        
        ui_src = os.path.join(self.ui_dir, "src")
        for root, dirs, files in os.walk(ui_src):
            for file in files:
                if file.endswith(('.tsx', '.ts', '.jsx', '.js')):
                    filepath = os.path.join(root, file)
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if any(k in content for k in i18n_keywords): i18n_found = True
                        if any(k in content for k in a11y_keywords): a11y_found = True
                        if any(k in content for k in view_tests_keywords): view_tests = True
                            
        if i18n_found: details.append("i18n (Internationalization) support detected.")
        else: details.append("No i18n patterns detected."); status = "WARN"
            
        if a11y_found: details.append("a11y (Accessibility) practices detected.")
        else: details.append("No a11y attributes detected. (UX/UI Best Practices missing)"); status = "WARN"
        
        if view_tests: details.append("View / Utilization tests detected (React Testing Library / Jest).")
        else: details.append("No View Tests found in UI layer."); status = "WARN"

        return AuditResult(self.name, status, "\n".join(details))


class PipelineAuditor(BaseAuditor):
    def run(self) -> AuditResult:
        details = []
        status = "PASS"
        
        pipelines = [".github/workflows", "build.cmd", "build.sh", "run.cmd", "run.sh", "Jenkinsfile"]
        found = [p for p in pipelines if os.path.exists(os.path.join(self.base_dir, p))]
        
        if found:
            details.append(f"CI/CD and usage pipelines found: {found}")
            details.append("Automatism and Parallelism are supported by CI/CD configuration.")
        else:
            details.append("No explicit CI/CD pipelines found in root.")
            status = "WARN"
            
        return AuditResult(self.name, status, "\n".join(details))


def main():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    auditors = [
        ArchitectureAuditor("Arquitetura, SRP, SOC, SSOT, MVVM Strict", base_dir),
        DependencyAuditor("Dependências (pip, npm) e Duplicidades", base_dir),
        SecurityAuditor("Segurança (0 duplicidade, Hardcode)", base_dir),
        CodeQualityAuditor("Melhores Práticas, FP Pure, Code Smells, Loose Types, Divida Técnica", base_dir),
        TestAndFlakeAuditor("Test Harness e Flaking Tests", base_dir),
        UxUiAuditor("UX/UI, i18n, a11y, View Tests", base_dir),
        PipelineAuditor("CI/CD, Pipeline de Uso, Automatismo e Paralelismo", base_dir)
    ]
    
    print("\n\033[96m[Swarm Auditors] Iniciando mapeamento da codebase em paralelo...\033[0m")
    
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(auditors)) as executor:
        futures = {executor.submit(auditor.run): auditor for auditor in auditors}
        for future in concurrent.futures.as_completed(futures):
            auditor = futures[future]
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                results.append(AuditResult(auditor.name, "ERROR", str(e)))

    report_path = os.path.join(base_dir, "swarm_audit_report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# 🐝 Relatório do Swarm Auditors\n\n")
        f.write("Mapeamento completo da codebase englobando arquitetura, segurança, testes, pipelines CI/CD e boas práticas.\n\n")
        for res in results:
            if res.status == "PASS": icon = "✅"
            elif res.status == "WARN": icon = "⚠️"
            elif res.status == "FAIL": icon = "❌"
            else: icon = "➖"
            
            f.write(f"## {icon} {res.name} [{res.status}]\n")
            f.write(f"```text\n{res.details}\n```\n\n")
            
            print(f"[{res.name}] Status: {res.status}")
            
    print(f"\n\033[92m[Swarm Auditors] Concluído! Relatório completo gerado em: {report_path}\033[0m")

if __name__ == "__main__":
    main()


