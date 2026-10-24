import { money, type Restaurant, type Totals } from "../shared/domain";

export default function TaxLines({
  restaurant,
  amounts,
}: {
  restaurant: Restaurant;
  amounts: Totals;
}) {
  const included = restaurant.gstInclusive ? " (included)" : "";
  // Older orders keep their original single GST line and original amount.
  if (amounts.cgst === undefined || amounts.sgst === undefined) {
    return (
      <div>
        <span>
          GST {restaurant.gstRate}%{included}
        </span>
        <span>{money(amounts.gst)}</span>
      </div>
    );
  }
  return (
    <>
      <div>
        <span>
          CGST {restaurant.cgstRate}%{included}
        </span>
        <span>{money(amounts.cgst)}</span>
      </div>
      <div>
        <span>
          SGST {restaurant.sgstRate}%{included}
        </span>
        <span>{money(amounts.sgst)}</span>
      </div>
    </>
  );
}
