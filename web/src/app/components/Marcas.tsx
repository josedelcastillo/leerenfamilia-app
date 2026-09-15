/** Eight 22×3 marks, coral up to the current week. Decorative: the text beside it says the same. */
export function Marcas({ actual, total }: { actual: number; total: number }) {
  return (
    <div className="marcas" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={index < actual ? 'is-hecha' : undefined} />
      ))}
    </div>
  );
}
