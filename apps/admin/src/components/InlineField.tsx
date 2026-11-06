import { useState } from 'react';
import { formatInlineMarkup, parseInlineMarkup, type Inline } from '@serend/schema';
import { Field } from '../ui';

/** Ein Textfeld für Inline-Text: [[Liquid]], *kursiv*, [Link](https://…). */
export function InlineField({
  label,
  value,
  onChange,
  multiline = false,
  error,
}: {
  label: string;
  value: Inline | null | undefined;
  onChange: (v: Inline) => void;
  multiline?: boolean;
  error?: string | undefined;
}) {
  const [text, setText] = useState(() => formatInlineMarkup(value));
  const change = (t: string) => {
    setText(t);
    onChange(parseInlineMarkup(t));
  };
  return (
    <Field label={`${label}  ·  [[Liquid]]  *kursiv*  [Link](url)`} error={error}>
      {multiline ? (
        <textarea value={text} onChange={(e) => change(e.target.value)} />
      ) : (
        <input value={text} onChange={(e) => change(e.target.value)} />
      )}
    </Field>
  );
}
