import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const InfoTip = ({ text }: { text: string }) => (
  <div className="absolute top-2 right-2">
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  </div>
);