import { redirect } from 'next/navigation';

export default function NewPositionPage() {
  redirect('/positions?tab=positions&create=1');
}
