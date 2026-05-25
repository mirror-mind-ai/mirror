from pathlib import Path

import pytest

from memory.web.docs import DocsBrowser


def make_repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    (root / "src" / "memory").mkdir(parents=True)
    (root / "docs" / "product" / "envisioning").mkdir(parents=True)
    (root / "docs" / "project" / "roadmap" / "cv1-one").mkdir(parents=True)
    (root / "docs" / "project" / "roadmap" / "cv10-ten").mkdir(parents=True)
    (root / "docs" / "project" / "roadmap" / "cv2-two").mkdir(parents=True)
    (root / "docs" / "product" / "specs" / "coherence-runtime").mkdir(parents=True)
    (root / "pyproject.toml").write_text("[project]\nname = 'mirror'\n", encoding="utf-8")
    (root / "docs" / "index.md").write_text("# Docs Index\n", encoding="utf-8")
    (root / "docs" / "product" / "index.md").write_text("# Product\n", encoding="utf-8")
    (root / "docs" / "product" / "envisioning" / "index.md").write_text(
        "# Coherence\n\n| A | B |\n|---|---|\n| 1 | 2 |\n", encoding="utf-8"
    )
    (root / "docs" / "project" / "roadmap" / "cv1-one" / "index.md").write_text(
        "# CV1\n", encoding="utf-8"
    )
    (root / "docs" / "project" / "roadmap" / "cv10-ten" / "index.md").write_text(
        "# CV10\n", encoding="utf-8"
    )
    (root / "docs" / "project" / "roadmap" / "cv2-two" / "index.md").write_text(
        "# CV2\n", encoding="utf-8"
    )
    (root / "docs" / "product" / "principles.md").write_text("# Principles\n", encoding="utf-8")
    (root / "docs" / "product" / "specs" / "index.md").write_text("# Specs\n", encoding="utf-8")
    (root / "docs" / "product" / "specs" / "coherence-runtime" / "index.md").write_text(
        "# Coherence Runtime Specification\n", encoding="utf-8"
    )
    (root / "README.md").write_text("# Readme\n", encoding="utf-8")
    (root / "AGENTS.md").write_text("# Runtime Prompt\n", encoding="utf-8")
    (root / "CLAUDE.md").write_text("# Runtime Prompt\n", encoding="utf-8")
    (root / "REFERENCE.md").write_text("# Runtime Prompt\n", encoding="utf-8")
    (root / ".env").write_text("SECRET=1\n", encoding="utf-8")
    return root


def flatten_tree(nodes) -> list[str]:
    paths: list[str] = []
    for node in nodes:
        if node.path:
            paths.append(node.path)
        paths.extend(flatten_tree(node.children))
    return paths


def find_node(nodes, title: str):
    for node in nodes:
        if node.title == title:
            return node
        found = find_node(node.children, title)
        if found:
            return found
    return None


def test_tree_lists_docs_and_root_docs(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    paths = flatten_tree(browser.tree())

    assert "docs/index.md" in paths
    assert "docs/product/envisioning/index.md" in paths
    assert "README.md" not in paths


def test_tree_puts_docs_home_first(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    (root / "docs" / "api.md").write_text("# Python API\n", encoding="utf-8")
    browser = DocsBrowser(root)

    nodes = browser.tree()

    assert nodes[0].title == "Home"
    assert nodes[0].path == "docs/index.md"


def test_tree_preserves_docs_folder_hierarchy(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    nodes = browser.tree()
    product = find_node(nodes, "Product")
    envisioning = find_node(nodes, "Envisioning")
    repository = find_node(nodes, "Repository")

    assert product is not None
    assert product.type == "directory"
    assert product.path == "docs/product/index.md"
    assert envisioning is not None
    assert envisioning.type == "directory"
    assert envisioning.path == "docs/product/envisioning/index.md"
    assert "docs/product/envisioning/index.md" in flatten_tree(product.children)
    assert repository is None


def test_product_tree_puts_principles_first(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    product = find_node(browser.tree(), "Product")
    assert product is not None

    assert [node.title for node in product.children][:3] == ["Principles", "Envisioning", "Specs"]


def test_specs_leaf_index_renders_as_file(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    specs = find_node(browser.tree(), "Specs")
    coherence_runtime = find_node(browser.tree(), "Coherence Runtime Specification")

    assert specs is not None
    assert specs.type == "directory"
    assert coherence_runtime is not None
    assert coherence_runtime.type == "file"
    assert coherence_runtime.path == "docs/product/specs/coherence-runtime/index.md"


def test_tree_uses_natural_sort_for_numbered_folders(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    roadmap = find_node(browser.tree(), "Roadmap")
    assert roadmap is not None

    titles = [node.title for node in roadmap.children]
    assert titles == ["Cv1 One", "Cv2 Two", "Cv10 Ten"]


def test_read_markdown_returns_allowed_doc(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    assert browser.read_markdown("docs/product/envisioning/index.md").startswith("# Coherence")


def test_render_html_uses_markdown_parser(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    html = browser.render_html("docs/product/envisioning/index.md")

    assert "<h1" in html
    assert "Coherence" in html
    assert "<table>" in html


def test_rejects_path_traversal(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    with pytest.raises(ValueError):
        browser.read_markdown("../.env")


def test_rejects_non_doc_root_file(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    with pytest.raises(ValueError):
        browser.read_markdown(".env")


def test_excludes_runtime_prompt_files(tmp_path: Path) -> None:
    root = make_repo(tmp_path)
    browser = DocsBrowser(root)

    paths = flatten_tree(browser.tree())

    assert "README.md" not in paths
    assert "AGENTS.md" not in paths
    assert "CLAUDE.md" not in paths
    assert "REFERENCE.md" not in paths

    with pytest.raises(ValueError):
        browser.read_markdown("AGENTS.md")
    with pytest.raises(ValueError):
        browser.read_markdown("README.md")
