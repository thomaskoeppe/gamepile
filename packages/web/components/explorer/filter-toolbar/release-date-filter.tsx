import { Calendar, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const MIN_YEAR = 1980;
const STABLE_CURRENT_YEAR = new Date().getFullYear();
const STABLE_MAX_YEAR = STABLE_CURRENT_YEAR + 2;

export function ReleaseDateFilter({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
}: {
  fromDate: string | null;
  toDate: string | null;
  onFromChange: (value: string | null) => void;
  onToChange: (value: string | null) => void;
}) {
  const [mode, setMode] = useState<"before" | "after" | "range">(
    fromDate && toDate ? "range" : fromDate ? "after" : toDate ? "before" : "range"
  );

  const getYearFromDate = (date: string | null): number => {
    if (!date) return STABLE_CURRENT_YEAR;
    return new Date(date).getFullYear();
  };

  const [selectedYear, setSelectedYear] = useState<number>(
    mode === "before" ? getYearFromDate(toDate) : mode === "after" ? getYearFromDate(fromDate) : STABLE_CURRENT_YEAR
  );

  const [yearRange, setYearRange] = useState<[number, number]>([
    fromDate ? getYearFromDate(fromDate) : MIN_YEAR + 20,
    toDate ? getYearFromDate(toDate) : STABLE_CURRENT_YEAR,
  ]);

  const hasFilter = fromDate !== null || toDate !== null;

  const handleModeChange = (newMode: "before" | "after" | "range") => {
    setMode(newMode);
    onFromChange(null);
    onToChange(null);
  };

  const handleYearChange = (values: number[]) => {
    if (mode === "range") {
      setYearRange([values[0], values[1]]);
    } else {
      setSelectedYear(values[0]);
    }
  };

  const handleYearCommit = (values: number[]) => {
    if (mode === "before") {
      onFromChange(null);
      onToChange(`${values[0]}-12-31`);
    } else if (mode === "after") {
      onFromChange(`${values[0]}-01-01`);
      onToChange(null);
    } else {
      onFromChange(`${values[0]}-01-01`);
      onToChange(`${values[1]}-12-31`);
    }
  };

  const getFilterLabel = () => {
    if (!hasFilter) return null;
    if (mode === "before" && toDate) {
      return `Before ${getYearFromDate(toDate)}`;
    }
    if (mode === "after" && fromDate) {
      return `After ${getYearFromDate(fromDate)}`;
    }
    if (fromDate && toDate) {
      return `${getYearFromDate(fromDate)}-${getYearFromDate(toDate)}`;
    }
    return null;
  };

  const filterLabel = getFilterLabel();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-2 border-border/50 bg-card/50 hover:bg-card/80 hover:border-border",
            hasFilter && "border-primary/50 bg-primary/5"
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          <span className="text-sm">Release Year</span>
          {filterLabel && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">
              {filterLabel}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Filter by Year</Label>
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onFromChange(null);
                  onToChange(null);
                  setSelectedYear(STABLE_CURRENT_YEAR);
                  setYearRange([MIN_YEAR + 20, STABLE_CURRENT_YEAR]);
                }}
              >
                Reset
              </Button>
            )}
          </div>

          <div className="flex rounded-lg border border-border/50 bg-muted/30 p-0.5">
            {(["before", "after", "range"] as const).map((m) => (
              <Button
                key={m}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 flex-1 rounded-md text-xs font-medium transition-all",
                  mode === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-transparent hover:text-foreground"
                )}
                onClick={() => handleModeChange(m)}
              >
                {m === "before" ? "Before" : m === "after" ? "After" : "Range"}
              </Button>
            ))}
          </div>

          <div className="space-y-3">
            {mode === "range" ? (
              <>
                <Slider
                  value={yearRange}
                  min={MIN_YEAR}
                  max={STABLE_MAX_YEAR}
                  step={1}
                  onValueChange={handleYearChange}
                  onValueCommit={handleYearCommit}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">From:</span>
                    <span className="font-medium">{yearRange[0]}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">To:</span>
                    <span className="font-medium">{yearRange[1]}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Slider
                  value={[selectedYear]}
                  min={MIN_YEAR}
                  max={STABLE_MAX_YEAR}
                  step={1}
                  onValueChange={handleYearChange}
                  onValueCommit={handleYearCommit}
                  className="w-full"
                />
                <div className="flex items-center justify-center text-sm">
                  <span className="mr-1.5 text-muted-foreground">
                    {mode === "before" ? "Released before" : "Released after"}
                  </span>
                  <span className="font-medium">{selectedYear}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-between border-t border-border/30 pt-1 text-[10px] text-muted-foreground">
            <span>{MIN_YEAR}</span>
            <span>{STABLE_MAX_YEAR}</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

