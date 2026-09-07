import { redirect } from 'next/navigation';

export default function NewDivisionPage() {
  redirect('/divisions?tab=divisions&create=1');
}
