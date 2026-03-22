export function SectionHeader({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="sectionHeader">
      <div>
        <p className="eyebrow">{title}</p>
        <h2>{description}</h2>
      </div>
    </div>
  );
}
