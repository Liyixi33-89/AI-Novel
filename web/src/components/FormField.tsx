import { cn } from "@/lib/api";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
};

const FormField = ({ label, htmlFor, hint, required, children, className }: FormFieldProps) => {
  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={htmlFor} className="label">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
};

export default FormField;
