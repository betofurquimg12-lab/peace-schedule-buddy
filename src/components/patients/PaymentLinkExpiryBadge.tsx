import { Badge } from "@/components/ui/badge";

interface Props {
  link?: string | null;
  expiresAt?: string | null;
}

export const PaymentLinkExpiryBadge = ({ link, expiresAt }: Props) => {
  if (!link || !expiresAt) return null;

  const [year, month, day] = expiresAt.split("-").map(Number);
  const expiry = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) {
    return <Badge variant="destructive">Link vencido</Badge>;
  }

  if (days <= 7) {
    return (
      <Badge className="border-warning/30 bg-warning/15 text-warning hover:bg-warning/15">
        {days === 0 ? "Link vence hoje" : `Link vence em ${days} dias`}
      </Badge>
    );
  }

  return null;
};