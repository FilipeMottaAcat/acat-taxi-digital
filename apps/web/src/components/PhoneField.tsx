import { maskPhone } from "@acat/shared";

interface PhoneFieldProps {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
}

export function PhoneField({ id, label = "Telefone", value, onChange }: PhoneFieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        placeholder="(13) 90000-0000"
        value={value}
        onChange={(e) => onChange(maskPhone(e.target.value))}
      />
    </div>
  );
}
