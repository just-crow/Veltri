export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`footer { display: none !important; }`}</style>
      {children}
    </>
  );
}
