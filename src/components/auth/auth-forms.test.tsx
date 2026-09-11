import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authentication form rendering.
 *
 * The Server Actions are doubled here — they are the server boundary, and this
 * file is about what the person filling in the form sees and can operate:
 * labels, autocomplete, error association, and the password toggle.
 */

const actions = vi.hoisted(() => ({
  signUpAction: vi.fn(async () => ({})),
  signInAction: vi.fn(async () => ({})),
  forgotPasswordAction: vi.fn(async () => ({})),
  updatePasswordAction: vi.fn(async () => ({})),
  resendVerificationAction: vi.fn(async () => ({})),
  signOutAction: vi.fn(async () => {}),
}));

vi.mock("@/app/actions/auth", () => actions);

const { SignInForm } = await import("@/components/auth/sign-in-form");
const { SignUpForm } = await import("@/components/auth/sign-up-form");
const { AuthCard } = await import("@/components/auth/auth-card");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sign-in form", () => {
  it("labels every control", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("uses the autocomplete tokens password managers rely on", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  it("offers a route to password recovery", () => {
    render(<SignInForm />);
    expect(
      screen.getByRole("link", { name: /forgot password/i }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("carries an intended destination through as a hidden field", () => {
    const { container } = render(<SignInForm next="/customers/42" />);
    const hidden = container.querySelector('input[name="next"]');
    expect(hidden).toHaveValue("/customers/42");
    // It is re-validated on the server; the hidden field is a convenience.
  });

  it("omits the hidden field when there is no destination", () => {
    const { container } = render(<SignInForm />);
    expect(container.querySelector('input[name="next"]')).toBeNull();
  });

  it("masks the password and reveals it only on request", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(field).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("does not submit the form when the toggle is pressed", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(actions.signInAction).not.toHaveBeenCalled();
  });
});

describe("sign-up form", () => {
  it("asks for exactly the four approved fields", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
  });

  it("requests a new password, not the stored one", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("states the password requirements before anything is typed", () => {
    render(<SignUpForm />);
    const list = screen.getByRole("list", { name: "Password requirements" });
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThanOrEqual(
      4,
    );
    expect(within(list).getAllByText(/not yet met/).length).toBe(
      within(list).getAllByRole("listitem").length,
    );
  });

  it("announces the requirements alongside the password field", () => {
    render(<SignUpForm />);
    const field = screen.getByLabelText("Password");
    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const list = screen.getByRole("list", { name: "Password requirements" });
    expect(describedBy?.split(" ")).toContain(list.id);
  });

  it("updates the checklist as the password is typed", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    const list = screen.getByRole("list", { name: "Password requirements" });

    await user.type(screen.getByLabelText("Password"), "Corr3ctHorseBattery");

    expect(within(list).queryAllByText(/not yet met/)).toHaveLength(0);
    expect(within(list).getAllByText(/— met/).length).toBeGreaterThanOrEqual(4);
  });

  it("does not convey requirement state by colour alone", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Password"), "abc");
    const list = screen.getByRole("list", { name: "Password requirements" });
    // Each item states its status in text for assistive technology.
    for (const item of within(list).getAllByRole("listitem")) {
      expect(item.textContent).toMatch(/met/);
    }
  });

  it("only toggles the field whose button was pressed", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    const toggles = screen.getAllByRole("button", { name: "Show password" });
    expect(toggles).toHaveLength(2);
    await user.click(toggles[0]!);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "type",
      "password",
    );
  });
});

describe("auth card", () => {
  it("gives the screen a single top-level heading", () => {
    render(
      <AuthCard title="Sign in" description="Welcome back.">
        <p>form</p>
      </AuthCard>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sign in",
    );
  });

  it("uses the elevated surface, not glass, for data entry", () => {
    const { container } = render(
      <AuthCard title="Sign in">
        <p>form</p>
      </AuthCard>,
    );
    const section = container.querySelector("section");
    expect(section?.className).toContain("surface-elevated");
    expect(section?.className).not.toContain("surface-glass");
  });

  it("scales its padding down on small screens", () => {
    const { container } = render(
      <AuthCard title="Sign in">
        <p>form</p>
      </AuthCard>,
    );
    const className = container.querySelector("section")?.className ?? "";
    // Comfortable on a phone, roomier from the small breakpoint up.
    expect(className).toContain("p-5");
    expect(className).toContain("sm:p-7");
  });
});
