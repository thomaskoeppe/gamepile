import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function MetacriticFilter({
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  min: number | null;
  max: number | null;
  onMinChange: (value: number | null) => void;
  onMaxChange: (value: number | null) => void;
}) {
  const [localValues, setLocalValues] = useState<[number, number]>([min ?? 0, max ?? 100]);

  const hasFilter = min !== null || max !== null;

  const handleSliderChange = (values: number[]) => {
    setLocalValues([values[0], values[1]]);
  };

  const handleSliderCommit = (values: number[]) => {
    const newMin = values[0] === 0 ? null : values[0];
    const newMax = values[1] === 100 ? null : values[1];
    onMinChange(newMin);
    onMaxChange(newMax);
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

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
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="text-sm">Metacritic</span>
          {hasFilter && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">
              {min ?? 0}-{max ?? 100}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Score Range</Label>
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onMinChange(null);
                  onMaxChange(null);
                  setLocalValues([0, 100]);
                }}
              >
                Reset
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <Slider
              value={localValues}
              min={0}
              max={100}
              step={5}
              onValueChange={handleSliderChange}
              onValueCommit={handleSliderCommit}
              className="w-full"
            />

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Min:</span>
                <span className={cn("font-medium", getScoreColor(localValues[0]))}>{localValues[0]}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Max:</span>
                <span className={cn("font-medium", getScoreColor(localValues[1]))}>{localValues[1]}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span>0-49</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span>50-74</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>75-100</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

