import React, { useState } from "react";
import styles from "./LoginForm.module.css";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^[A-Za-z0-9!@#$%^&*]+$/;
const MAX_EMAIL_LENGTH = 20;
const MAX_PASSWORD_LENGTH = 12;

// Reusable controlled login form with client-side validation and API submission.
export default function LoginForm({ apiUrl, csrfToken, onSuccess }) {
  // Controlled field values keep the form state in React.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Validate before sending credentials so the user gets immediate feedback.
  function validate() {
    const normalizedEmail = email.trim();
    if (normalizedEmail.length > MAX_EMAIL_LENGTH) return "Email must be 20 characters or fewer.";
    if (!emailPattern.test(normalizedEmail)) return "Enter a valid email address.";
    if (!password) return "Password is required.";
    if (password.length > MAX_PASSWORD_LENGTH) return "Password must be 12 characters or fewer.";
    if (!passwordPattern.test(password)) return "Password may only use letters, numbers, and ! @ # $ % ^ & *.";
    return "";
  }

  // Submit credentials to the Express login endpoint with the CSRF header.
  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/auth/signin`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to sign in.");
      onSuccess(data.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <label className={styles.field}>
        <span>Email</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" maxLength={MAX_EMAIL_LENGTH} aria-invalid={Boolean(error)} required />
      </label>
      <label className={styles.field}>
        <span>Password</span>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" maxLength={MAX_PASSWORD_LENGTH} pattern="[A-Za-z0-9!@#$%^&*]+" aria-invalid={Boolean(error)} required />
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={loading}>{loading ? "Signing in..." : "Log In"}</button>
    </form>
  );
}
