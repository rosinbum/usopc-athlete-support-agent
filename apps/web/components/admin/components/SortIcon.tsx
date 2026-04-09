import { ChevronUp, ChevronDown } from "lucide-react";

interface SortIconProps<T extends string> {
  field: T;
  activeField: T;
  direction: "asc" | "desc";
}

export function SortIcon<T extends string>({
  field,
  activeField,
  direction,
}: SortIconProps<T>) {
  if (activeField !== field)
    return <ChevronUp className="w-3 h-3 text-gray-300" />;
  return direction === "asc" ? (
    <ChevronUp className="w-3 h-3" />
  ) : (
    <ChevronDown className="w-3 h-3" />
  );
}
