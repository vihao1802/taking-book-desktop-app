interface NoteTextBoxProps {
  value: string;
  onChange: (text: string) => void;
}

/** The multi-line box a Note's text is written in; it takes focus as soon as its card appears. */
export function NoteTextBox({ value, onChange }: NoteTextBoxProps) {
  return (
    <textarea
      autoFocus
      rows={4}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Write a note…"
      aria-label="Note text"
      className="border-input bg-secondary/50 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px]"
    />
  );
}
