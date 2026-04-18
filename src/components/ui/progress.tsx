import * as React from "react";
import { cn } from "../../lib/utils";
import { getUsageColor } from "../../lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  colorClass?: string;
}

function Progress({ value, colorClass, className, ...props }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  // Map text color classes to bg color classes for the bar
  const resolvedColor =
    colorClass ??
    (() => {
      const usage = getUsageColor(clamped);
      if (usage.includes("red")) return "bg-red-500";
      if (usage.includes("orange")) return "bg-orange-500";
      return "bg-green-500";
    })();

  return (
    <div
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-gray-200", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-300", resolvedColor)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export { Progress };
