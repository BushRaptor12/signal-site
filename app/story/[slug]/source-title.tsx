type SourceTitleProps = {
  title: string;
  className?: string;
};

export default function SourceTitle({ title, className }: SourceTitleProps) {
  return (
    <span className={`${className ?? ""} break-words`.trim()} title={title}>
      {title}
    </span>
  );
}
