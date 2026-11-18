import { requireBusinessMember } from "@/lib/auth/authorization";
import WhatsAppSupportWorkspace from "./whatsapp-support-workspace";

export default async function BusinessSupportPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { business } = await requireBusinessMember(businessId);
  return <WhatsAppSupportWorkspace businessId={business.id} businessName={business.name} />;
}
