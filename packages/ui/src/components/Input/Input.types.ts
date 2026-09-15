/**
 * Input props.
 *
 */
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Sits inside the control, above the value. Always present — never a placeholder in disguise. */
  label: string;
  error?: string;
  /** Rendered at the right edge inside the control: a clear button, a unit, an icon. */
  adornment?: ReactNode;
  /** Wrapper class, so a call site can restyle the control without cloning it. */
  className?: string;
}
