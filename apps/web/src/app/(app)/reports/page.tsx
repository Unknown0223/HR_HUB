'use client';

import { useSearchParams } from 'next/navigation';
import { useUrlParam } from '@/lib/use-url-state';
import { QuickReports } from './QuickReports';
import { ReportsHub } from './ReportsHub';

/** `/reports` is the report hub; `/reports?tab=…` keeps the quick-report tabs. */
export default function ReportsPage() {
  const searchParams = useSearchParams();
  const [category, setCategory] = useUrlParam('category', '');
  const [query, setQuery] = useUrlParam('q', '');

  if (searchParams?.get('tab')) return <QuickReports />;
  return (
    <ReportsHub category={category} onCategory={setCategory} query={query} onQuery={setQuery} />
  );
}
