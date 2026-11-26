export interface LoginFormValues {
  email: string;
  password: string;
}

export interface LoginValidationErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginForm(values: LoginFormValues): LoginValidationErrors {
  const errors: LoginValidationErrors = {};
  const email = values.email.trim();

  if (!email) {
    errors.email = "Email wajib diisi.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Format email tidak valid.";
  }

  if (!values.password) {
    errors.password = "Password wajib diisi.";
  }

  return errors;
}
