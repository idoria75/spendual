import { applyCachedTheme, applyTheme } from "./theme";

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("data-theme");
});

describe("theme cache", () => {
  it("applyTheme stores the choice and applyCachedTheme restores it", () => {
    applyTheme("dark");
    root.removeAttribute("data-theme");
    applyCachedTheme();
    expect(root).toHaveAttribute("data-theme", "dark");
  });

  it("ignores a bad or missing cache", () => {
    applyCachedTheme();
    expect(root).not.toHaveAttribute("data-theme");
    localStorage.setItem("spendual.theme", "purple");
    applyCachedTheme();
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("still applies when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    applyTheme("light");
    expect(root).toHaveAttribute("data-theme", "light");
    spy.mockRestore();
  });
});
