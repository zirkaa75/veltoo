import InvitationActivation from "./invitation-activation";

export const instant = false;

export default async function BusinessInvitationPage({
  params,
}: PageProps<"/business/invitation/[token]">) {
  const { token } = await params;
  return <InvitationActivation invitationId={token} />;
}
