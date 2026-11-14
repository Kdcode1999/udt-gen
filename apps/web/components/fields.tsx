"use client";
import React from "react";

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
  <div className={className}>
    <label>
      {label}
      {hint && <span className="normal-case tracking-normal text-[var(--muted)] ml-2">{hint}</span>}
    </label>
    {children}
  </div>
);

export const Text: React.FC<{ label: string; value?: string; onChange: (v: string | undefined) => void; placeholder?: string; hint?: string; className?: string }> = ({ label, value, onChange, placeholder, hint, className }) => (
  <Field label={label} hint={hint} className={className}>
    <input value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />
  </Field>
);

export const Area: React.FC<{ label: string; value?: string; onChange: (v: string | undefined) => void; rows?: number; placeholder?: string; hint?: string; className?: string }> = ({ label, value, onChange, rows = 3, placeholder, hint, className }) => (
  <Field label={label} hint={hint} className={className}>
    <textarea rows={rows} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />
  </Field>
);

export const Num: React.FC<{ label: string; value?: number; onChange: (v: number | undefined) => void; step?: number; min?: number; max?: number; hint?: string; className?: string; placeholder?: string }> = ({ label, value, onChange, step = 1, min, max, hint, className, placeholder }) => (
  <Field label={label} hint={hint} className={className}>
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  </Field>
);

export const Select: React.FC<{ label: string; value?: string; onChange: (v: string | undefined) => void; options: { value: string; label: string }[]; allowEmpty?: string; hint?: string; className?: string }> = ({ label, value, onChange, options, allowEmpty, hint, className }) => (
  <Field label={label} hint={hint} className={className}>
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </Field>
);

export const Check: React.FC<{ label: string; value?: boolean; onChange: (v: boolean | undefined) => void; hint?: string }> = ({ label, value, onChange, hint }) => (
  <label className="!flex items-center gap-2 cursor-pointer !normal-case !tracking-normal !text-sm !text-[var(--fg)] !mb-0">
    <input type="checkbox" className="!w-4 !h-4" checked={!!value} onChange={(e) => onChange(e.target.checked ? true : undefined)} />
    {label}
    {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
  </label>
);

export const Row: React.FC<{ children: React.ReactNode; cols?: number }> = ({ children, cols = 2 }) => (
  <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
    {children}
  </div>
);

export const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <section className="card p-4 grid gap-3">
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-bold tracking-[.12em] uppercase text-[var(--muted)]">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);
