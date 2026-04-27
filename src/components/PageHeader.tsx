export const PageHeader = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
    <div>
      <h1 className="text-2xl md:text-3xl">{title}</h1>
      {description && <p className="text-muted-foreground text-sm mt-1">{description}</p>}
    </div>
    {action}
  </div>
);
