#!/usr/bin/env python3
"""Reset the sandbox-pet-store Builder runtime fixture.

Default state is `ariad-ready`: the journey keeps Ariad adopted, templates
prepared, and an initial cursor with no active item. Use `--state clean` to
clear Builder runtime state and remove Ariad-generated template files.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from memory import MemoryClient
from memory.builder.ariad_method import get_ariad_method
from memory.builder.delivery_cursor import clear_delivery_cursor, set_delivery_cursor
from memory.builder.method_adoption import clear_adopted_method, set_adopted_method
from memory.builder.template_generation import prepare_method_templates

JOURNEY = "sandbox-pet-store"
PROJECT_PATH = Path("/Users/alissonvale/Code/sandbox-pet-store")
ROADMAP_INDEX = PROJECT_PATH / "docs/project/roadmap/index.md"
WORKLOG_PATH = PROJECT_PATH / "docs/process/worklog.md"
REFERENCE_PATH = PROJECT_PATH / "REFERENCE.md"
GENERATED_FILES = (
    PROJECT_PATH / "docs/project/roadmap/ariad-adoption.md",
    PROJECT_PATH / "docs/project/roadmap/technical-debt-ledger.md",
)
GENERATED_DIRS = (
    PROJECT_PATH / "docs/project/roadmap/templates",
    PROJECT_PATH / "docs/project/roadmap/cv2-checkout-flow",
    PROJECT_PATH / "docs/project/roadmap/cv2-enter-checkout-from-cart",
    PROJECT_PATH / "docs/project/roadmap/cv2-checkout-entry-and-address-capture",
)
BUILD_OUTPUT_DIRS = (PROJECT_PATH / "dist",)

ROADMAP_BASELINE = """# Roadmap

The roadmap describes meaningful progress for Sandbox Pet Store using current Ariad delivery language.

## Taxonomy

- **Capability Value, CV**: a major user-visible or operator-visible capability.
- **Delivery Story, DS**: a coherent delivery slice inside a CV.
- **User Story, US**: user-visible behavior that can be verified end to end.
- **Technical Story, TS**: technical substrate needed for delivery.
- **Task**: implementation step inside a User Story or Technical Story.

Legacy `CVx.Ex.Sy` references in older notes are compatibility artifacts only. New simulation work should use CV / DS / US / TS language.

## Simulation Baseline

`CV1 Cart Flow` is complete.

No Delivery Story is active at reset. Checkout is a candidate future capability, not an automatic next story. When the fixture is loaded, the Driver should orient and ask what mode the Navigator wants:

- runtime inspection;
- Delivery planning;
- Exploration.

## Capability Values

| Code | Capability Value | Status |
|------|------------------|--------|
| CV1 | Cart Flow | Done |
| CV2 | Checkout Flow | Candidate |
| CV3 | Store Polish | Future |

## CV1: Cart Flow

**Status:** Done

Purpose: make the first product movement concrete enough for a customer to start shopping.

### DS1: Basic Cart Behavior

**Status:** Done

| Code | User Story | Status | Notes |
|------|------------|--------|-------|
| US1 | Add item to cart | Done | Shows one featured product and lets the customer add it to the cart with quantity 1. |
| US2 | Update quantity | Done | Lets the customer increase and decrease quantity while keeping a minimum of 1. |
| US3 | Remove item from cart | Done | Lets the customer explicitly remove the item and return to the empty cart state. |

### DS2: Cart Review

**Status:** Done

| Code | User Story | Status | Notes |
|------|------------|--------|-------|
| US1 | Show cart summary | Done | Shows item count, subtotal, and cart total when the cart has an item. |
| US2 | Continue shopping | Done | Lets the user return to the product area while preserving cart state. |

## CV2: Checkout Flow

**Status:** Candidate

Purpose: extend the cart into a simple checkout path if the Navigator chooses Delivery work.

Candidate Delivery Stories:

- DS1 Checkout entry and address capture.
- DS2 Payment placeholder.
- DS3 Order confirmation placeholder.

These are candidates only. Do not start them automatically when the project is loaded.

## CV3: Store Polish

**Status:** Future

Potential future work:

- simple catalog filtering;
- personalization by pet profile;
- responsive layout;
- order confirmation polish.
"""

REFERENCE_BASELINE = """# Sandbox Pet Store Reference

Operational reference for the resettable Builder Mode dogfood fixture.

## Builder Fixture Contract

- This project is intentionally small and local-first.
- `CV1 Cart Flow` is complete at reset.
- `CV2 Checkout Flow` is a candidate capability, not automatic active work.
- Builder sessions should orient the Navigator before starting lifecycle work.
- Ariad reset state is managed by `/Users/alissonvale/Code/mirror-dev/scripts/reset_sandbox_pet_store.py`.

## Common Commands

```bash
npm test
npm run build
```

## Reset

From `/Users/alissonvale/Code/mirror-dev`:

```bash
~/reset-sandbox-pet-store.sh --state ariad-ready --full
```
"""

WORKLOG_BASELINE = """# Worklog

Operational progress for Sandbox Pet Store.

## Simulation Baseline

The fixture is resettable for Builder Mode dogfood simulations.

Baseline state:

- `CV1 Cart Flow` complete.
- No active Delivery Story.
- Checkout is a candidate future capability.
- Session entry should orient and ask for mode instead of auto-starting Delivery.

## Done

### Project initialized

Initialized the project documentation and roadmap for Sandbox Pet Store.

### CV1 Cart Flow complete

Completed the first cart flow slice: add item, update quantity, remove item, show cart summary, and continue shopping. The project has an executable Vite TypeScript app with automated behavior coverage and a manually validated cart path.

Historical notes may refer to `CV1.E1.S1` style identifiers. Treat those as legacy compatibility references; new simulation work uses CV / Delivery Story / User Story / Technical Story language.
"""

CART_TS_BASELINE = 'export type Product = {\n  id: string;\n  name: string;\n  description: string;\n  priceInCents: number;\n};\n\ntype CartItem = {\n  product: Product;\n  quantity: number;\n};\n\ntype CartState = {\n  item: CartItem | null;\n};\n\nexport const featuredProduct: Product = {\n  id: "sandbox-kibble",\n  name: "Sandbox Kibble",\n  description: "Balanced everyday food for curious dogs.",\n  priceInCents: 2499\n};\n\nexport function createCartApp(root: HTMLElement): void {\n  const state: CartState = { item: null };\n\n  function render(): void {\n    root.innerHTML = `\n      <section class="storefront" aria-labelledby="store-title">\n        <div class="hero">\n          <p class="eyebrow">Pet food made simple</p>\n          <h1 id="store-title">Sandbox Pet Store</h1>\n          <p>Choose a trusted food and start a clear cart review.</p>\n        </div>\n\n        <article class="product-card" id="featured-product" tabindex="-1" aria-labelledby="product-name">\n          <div>\n            <p class="eyebrow">Featured food</p>\n            <h2 id="product-name">${featuredProduct.name}</h2>\n            <p>${featuredProduct.description}</p>\n            <p class="price">${formatPrice(featuredProduct.priceInCents)}</p>\n          </div>\n          <button type="button" data-testid="add-to-cart">Add to cart</button>\n        </article>\n\n        <aside class="cart" aria-labelledby="cart-title">\n          <h2 id="cart-title">Cart</h2>\n          ${renderCart(state)}\n        </aside>\n      </section>\n    `;\n\n    root\n      .querySelector<HTMLButtonElement>("[data-testid=\'add-to-cart\']")\n      ?.addEventListener("click", () => {\n        state.item = { product: featuredProduct, quantity: 1 };\n        render();\n      });\n\n    root\n      .querySelector<HTMLButtonElement>("[data-testid=\'increase-quantity\']")\n      ?.addEventListener("click", () => {\n        if (!state.item) {\n          return;\n        }\n\n        state.item = { ...state.item, quantity: state.item.quantity + 1 };\n        render();\n      });\n\n    root\n      .querySelector<HTMLButtonElement>("[data-testid=\'decrease-quantity\']")\n      ?.addEventListener("click", () => {\n        if (!state.item || state.item.quantity === 1) {\n          return;\n        }\n\n        state.item = { ...state.item, quantity: state.item.quantity - 1 };\n        render();\n      });\n\n    root\n      .querySelector<HTMLButtonElement>("[data-testid=\'remove-item\']")\n      ?.addEventListener("click", () => {\n        state.item = null;\n        render();\n      });\n\n    root\n      .querySelector<HTMLButtonElement>("[data-testid=\'continue-shopping\']")\n      ?.addEventListener("click", () => {\n        const featuredProductElement = root.querySelector<HTMLElement>("#featured-product");\n\n        featuredProductElement?.scrollIntoView({ behavior: "smooth", block: "start" });\n        featuredProductElement?.focus({ preventScroll: true });\n      });\n  }\n\n  render();\n}\n\nfunction renderCart(state: CartState): string {\n  if (!state.item) {\n    return `<p data-testid="empty-cart">Your cart is empty.</p>`;\n  }\n\n  const itemTotal = state.item.product.priceInCents * state.item.quantity;\n\n  return `\n    <div data-testid="cart-item" class="cart-item">\n      <span>${state.item.product.name}</span>\n      <div class="quantity-controls" aria-label="Quantity controls">\n        <button\n          type="button"\n          data-testid="decrease-quantity"\n          aria-label="Decrease quantity"\n          ${state.item.quantity === 1 ? "disabled" : ""}\n        >-</button>\n        <span data-testid="cart-quantity">Quantity: ${state.item.quantity}</span>\n        <button\n          type="button"\n          data-testid="increase-quantity"\n          aria-label="Increase quantity"\n        >+</button>\n      </div>\n      <strong>${formatPrice(itemTotal)}</strong>\n      <button type="button" data-testid="remove-item" class="remove-button">Remove</button>\n    </div>\n    ${renderCartSummary(state.item)}\n  `;\n}\n\nfunction renderCartSummary(item: CartItem): string {\n  const subtotal = item.product.priceInCents * item.quantity;\n\n  return `\n    <section class="cart-summary" data-testid="cart-summary" aria-labelledby="cart-summary-title">\n      <h3 id="cart-summary-title">Cart summary</h3>\n      <dl>\n        <div>\n          <dt>Items</dt>\n          <dd data-testid="summary-items">${item.quantity}</dd>\n        </div>\n        <div>\n          <dt>Subtotal</dt>\n          <dd data-testid="summary-subtotal">${formatPrice(subtotal)}</dd>\n        </div>\n        <div>\n          <dt>Cart total</dt>\n          <dd data-testid="summary-total">${formatPrice(subtotal)}</dd>\n        </div>\n      </dl>\n      <div class="cart-actions">\n        <button type="button" data-testid="continue-shopping" class="secondary-button">\n          Continue shopping\n        </button>\n      </div>\n    </section>\n  `;\n}\n\nfunction formatPrice(priceInCents: number): string {\n  return new Intl.NumberFormat("en-US", {\n    style: "currency",\n    currency: "USD"\n  }).format(priceInCents / 100);\n}\n'

STYLES_CSS_BASELINE = ':root {\n  color: #17311f;\n  background: #f7f3e8;\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n}\n\nbody {\n  margin: 0;\n}\n\nbutton {\n  border: 0;\n  border-radius: 999px;\n  background: #2f6b3f;\n  color: #ffffff;\n  cursor: pointer;\n  font: inherit;\n  font-weight: 700;\n  padding: 0.8rem 1.2rem;\n}\n\nbutton:focus-visible,\n.product-card:focus-visible {\n  outline: 3px solid #f0b84d;\n  outline-offset: 3px;\n}\n\n.storefront {\n  display: grid;\n  gap: 1.5rem;\n  margin: 0 auto;\n  max-width: 880px;\n  padding: 4rem 1.5rem;\n}\n\n.hero,\n.product-card,\n.cart {\n  background: #fffdf7;\n  border: 1px solid #e5dbc5;\n  border-radius: 24px;\n  box-shadow: 0 18px 60px rgba(23, 49, 31, 0.08);\n  padding: 2rem;\n}\n\n.hero h1,\n.product-card h2,\n.cart h2 {\n  margin-top: 0;\n}\n\n.eyebrow {\n  color: #7b5b1e;\n  font-size: 0.8rem;\n  font-weight: 800;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n\n.product-card {\n  align-items: center;\n  display: flex;\n  justify-content: space-between;\n  gap: 2rem;\n}\n\n.price {\n  font-size: 1.4rem;\n  font-weight: 800;\n}\n\n.cart-item,\n.quantity-controls {\n  align-items: center;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 1rem;\n}\n\n.cart-item {\n  justify-content: space-between;\n}\n\n.quantity-controls button {\n  align-items: center;\n  display: inline-flex;\n  height: 2.4rem;\n  justify-content: center;\n  padding: 0;\n  width: 2.4rem;\n}\n\n.quantity-controls button:disabled {\n  background: #c9c1b1;\n  cursor: not-allowed;\n}\n\n.remove-button {\n  background: #8b3f32;\n}\n\n.secondary-button {\n  background: #f0eadb;\n  color: #17311f;\n}\n\n.cart-summary {\n  border-top: 1px solid #e5dbc5;\n  margin-top: 1.5rem;\n  padding-top: 1.5rem;\n}\n\n.cart-summary h3 {\n  margin-top: 0;\n}\n\n.cart-summary dl {\n  display: grid;\n  gap: 0.75rem;\n  margin: 0 0 1.5rem;\n}\n\n.cart-summary div {\n  display: flex;\n  justify-content: space-between;\n  gap: 1rem;\n}\n\n.cart-summary dd {\n  font-weight: 800;\n  margin: 0;\n}\n\n.cart-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 1rem;\n}\n\n@media (max-width: 640px) {\n  .product-card {\n    align-items: stretch;\n    flex-direction: column;\n  }\n}\n'

CART_TEST_TS_BASELINE = 'import { describe, expect, it, vi } from "vitest";\nimport { createCartApp } from "../src/cart";\n\ndescribe("cart app", () => {\n  it("shows an empty cart before a product is added", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n\n    expect(root.querySelector("[data-testid=\'empty-cart\']")?.textContent).toContain(\n      "Your cart is empty."\n    );\n  });\n\n  it("adds the featured product to the cart with quantity one", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n    addFeaturedProduct(root);\n\n    const cartItem = root.querySelector("[data-testid=\'cart-item\']");\n\n    expect(cartItem?.textContent).toContain("Sandbox Kibble");\n    expect(cartItem?.textContent).toContain("Quantity: 1");\n    expect(cartItem?.textContent).toContain("$24.99");\n    expect(root.querySelector("[data-testid=\'empty-cart\']")).toBeNull();\n  });\n\n  it("increases the cart quantity and item total", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n    addFeaturedProduct(root);\n    root.querySelector<HTMLButtonElement>("[data-testid=\'increase-quantity\']")?.click();\n\n    const cartItem = root.querySelector("[data-testid=\'cart-item\']");\n\n    expect(cartItem?.textContent).toContain("Quantity: 2");\n    expect(cartItem?.textContent).toContain("$49.98");\n  });\n\n  it("decreases the cart quantity without removing the item", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n    addFeaturedProduct(root);\n    root.querySelector<HTMLButtonElement>("[data-testid=\'increase-quantity\']")?.click();\n    root.querySelector<HTMLButtonElement>("[data-testid=\'decrease-quantity\']")?.click();\n\n    const cartItem = root.querySelector("[data-testid=\'cart-item\']");\n\n    expect(cartItem?.textContent).toContain("Quantity: 1");\n    expect(cartItem?.textContent).toContain("$24.99");\n    expect(cartItem).not.toBeNull();\n  });\n\n  it("does not decrease below quantity one", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n    addFeaturedProduct(root);\n\n    const decreaseButton = root.querySelector<HTMLButtonElement>(\n      "[data-testid=\'decrease-quantity\']"\n    );\n\n    expect(decreaseButton?.disabled).toBe(true);\n\n    decreaseButton?.click();\n\n    expect(root.querySelector("[data-testid=\'cart-item\']")?.textContent).toContain(\n      "Quantity: 1"\n    );\n  });\n\n  it("removes the cart item and restores the empty cart state", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n    addFeaturedProduct(root);\n    root.querySelector<HTMLButtonElement>("[data-testid=\'increase-quantity\']")?.click();\n    root.querySelector<HTMLButtonElement>("[data-testid=\'remove-item\']")?.click();\n\n    expect(root.querySelector("[data-testid=\'cart-item\']")).toBeNull();\n    expect(root.querySelector("[data-testid=\'empty-cart\']")?.textContent).toContain(\n      "Your cart is empty."\n    );\n  });\n\n  it("lets the customer add the product again after removal", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n    addFeaturedProduct(root);\n    root.querySelector<HTMLButtonElement>("[data-testid=\'increase-quantity\']")?.click();\n    root.querySelector<HTMLButtonElement>("[data-testid=\'remove-item\']")?.click();\n    addFeaturedProduct(root);\n\n    const cartItem = root.querySelector("[data-testid=\'cart-item\']");\n\n    expect(cartItem?.textContent).toContain("Sandbox Kibble");\n    expect(cartItem?.textContent).toContain("Quantity: 1");\n    expect(cartItem?.textContent).toContain("$24.99");\n  });\n\n  it("shows a cart summary for the selected item", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n    addFeaturedProduct(root);\n\n    expect(root.querySelector("[data-testid=\'cart-summary\']")?.textContent).toContain(\n      "Cart summary"\n    );\n    expect(root.querySelector("[data-testid=\'summary-items\']")?.textContent).toBe("1");\n    expect(root.querySelector("[data-testid=\'summary-subtotal\']")?.textContent).toBe(\n      "$24.99"\n    );\n    expect(root.querySelector("[data-testid=\'summary-total\']")?.textContent).toBe(\n      "$24.99"\n    );\n  });\n\n  it("updates the cart summary when quantity changes", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n    addFeaturedProduct(root);\n    root.querySelector<HTMLButtonElement>("[data-testid=\'increase-quantity\']")?.click();\n\n    expect(root.querySelector("[data-testid=\'summary-items\']")?.textContent).toBe("2");\n    expect(root.querySelector("[data-testid=\'summary-subtotal\']")?.textContent).toBe(\n      "$49.98"\n    );\n    expect(root.querySelector("[data-testid=\'summary-total\']")?.textContent).toBe(\n      "$49.98"\n    );\n  });\n\n  it("hides the cart summary when the cart is empty", () => {\n    const root = document.createElement("main");\n\n    createCartApp(root);\n\n    expect(root.querySelector("[data-testid=\'cart-summary\']")).toBeNull();\n\n    addFeaturedProduct(root);\n    root.querySelector<HTMLButtonElement>("[data-testid=\'remove-item\']")?.click();\n\n    expect(root.querySelector("[data-testid=\'cart-summary\']")).toBeNull();\n    expect(root.querySelector("[data-testid=\'empty-cart\']")?.textContent).toContain(\n      "Your cart is empty."\n    );\n  });\n\n  it("returns focus to the featured product without changing the cart", () => {\n    const root = document.createElement("main");\n    const scrollIntoView = vi.fn();\n\n    document.body.append(root);\n    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;\n\n    createCartApp(root);\n    addFeaturedProduct(root);\n    root.querySelector<HTMLButtonElement>("[data-testid=\'increase-quantity\']")?.click();\n    root.querySelector<HTMLButtonElement>("[data-testid=\'continue-shopping\']")?.click();\n\n    const featuredProduct = root.querySelector<HTMLElement>("#featured-product");\n    const cartItem = root.querySelector("[data-testid=\'cart-item\']");\n\n    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });\n    expect(document.activeElement).toBe(featuredProduct);\n    expect(cartItem?.textContent).toContain("Quantity: 2");\n    expect(root.querySelector("[data-testid=\'summary-total\']")?.textContent).toBe(\n      "$49.98"\n    );\n  });\n});\n\nfunction addFeaturedProduct(root: HTMLElement): void {\n  root.querySelector<HTMLButtonElement>("[data-testid=\'add-to-cart\']")?.click();\n}\n'


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset sandbox-pet-store Builder fixture")
    parser.add_argument(
        "--state",
        choices=("clean", "ariad-ready"),
        default="ariad-ready",
        help="Reset target state. Default: ariad-ready",
    )
    parser.add_argument(
        "--restore-code",
        action="store_true",
        help="Restore src/cart.ts, src/styles.css, and tests/cart.test.ts to the sandbox baseline.",
    )
    parser.add_argument(
        "--clean-build-output",
        action="store_true",
        help="Remove generated build output such as dist/.",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Full fixture reset: restore code and remove build output in addition to Ariad/runtime reset.",
    )
    args = parser.parse_args()

    mem = MemoryClient()
    journey_content = mem.get_identity("journey", JOURNEY)
    if not journey_content:
        raise SystemExit(f"journey '{JOURNEY}' not found in Mirror memory")
    if not PROJECT_PATH.is_dir():
        raise SystemExit(f"project path does not exist: {PROJECT_PATH}")

    mem.journeys.set_project_path(JOURNEY, str(PROJECT_PATH))
    _restore_roadmap_baseline()
    _restore_worklog_baseline()
    _restore_reference_baseline()
    _remove_generated_ariad_files()
    if args.restore_code or args.full:
        _restore_code_baseline()
    if args.clean_build_output or args.full:
        _remove_build_output()
    clear_adopted_method(mem.store, JOURNEY)
    clear_delivery_cursor(mem.store, JOURNEY)
    _clear_workbench_state(mem)

    if args.state == "ariad-ready":
        set_adopted_method(mem.store, JOURNEY, "ariad")
        prepare_method_templates(PROJECT_PATH, journey=JOURNEY, method=get_ariad_method())
        set_delivery_cursor(
            mem.store,
            journey=JOURNEY,
            method="ariad",
            active_item=None,
            active_checkpoint=None,
            pending_confirmation=None,
            last_delivery_event="template_preparation",
        )

    print(f"sandbox-pet-store reset complete: state={args.state}")
    print(f"project_path={PROJECT_PATH}")
    print("workbench_state=cleared")
    if args.restore_code or args.full:
        print("code_baseline=restored")
    if args.clean_build_output or args.full:
        print("build_output=removed")
    if args.state == "ariad-ready":
        print("adopted_method=ariad")
        print("active_item=none")
        print("last_delivery_event=template_preparation")


def _restore_roadmap_baseline() -> None:
    ROADMAP_INDEX.parent.mkdir(parents=True, exist_ok=True)
    ROADMAP_INDEX.write_text(ROADMAP_BASELINE, encoding="utf-8")


def _restore_worklog_baseline() -> None:
    WORKLOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    WORKLOG_PATH.write_text(WORKLOG_BASELINE, encoding="utf-8")


def _restore_reference_baseline() -> None:
    REFERENCE_PATH.write_text(REFERENCE_BASELINE, encoding="utf-8")


def _clear_workbench_state(mem: MemoryClient) -> None:
    mem.store.conn.execute("DELETE FROM builder_refinement_cursors WHERE journey = ?", (JOURNEY,))
    mem.store.conn.execute("DELETE FROM builder_change_requests WHERE journey = ?", (JOURNEY,))
    mem.store.conn.execute("DELETE FROM builder_refinement_stories WHERE journey = ?", (JOURNEY,))
    mem.store.conn.commit()


def _remove_generated_ariad_files() -> None:
    for path in GENERATED_FILES:
        path.unlink(missing_ok=True)
    for path in GENERATED_DIRS:
        if path.exists():
            shutil.rmtree(path)


def _restore_code_baseline() -> None:
    (PROJECT_PATH / "src/cart.ts").write_text(CART_TS_BASELINE, encoding="utf-8")
    (PROJECT_PATH / "src/styles.css").write_text(STYLES_CSS_BASELINE, encoding="utf-8")
    (PROJECT_PATH / "tests/cart.test.ts").write_text(CART_TEST_TS_BASELINE, encoding="utf-8")


def _remove_build_output() -> None:
    for path in BUILD_OUTPUT_DIRS:
        if path.exists():
            shutil.rmtree(path)


if __name__ == "__main__":
    main()
