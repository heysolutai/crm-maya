import { Skeleton } from '@/components/ui/skeleton';

interface SkeletonListProps {
  count?: number;
  className?: string;
}

export function ConversationListSkeleton({ count = 5 }: SkeletonListProps) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 border-b border-border">
          <div className="flex items-start gap-3">
            <Skeleton className="h-12 w-12 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-3 w-24" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableRowSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex} className="p-4">
              <Skeleton className="h-4 w-full max-w-[200px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function MessageListSkeleton({ count = 5 }: SkeletonListProps) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          <div className={`flex gap-2 max-w-[70%] ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
            {i % 2 === 0 && <Skeleton className="h-8 w-8 rounded-full shrink-0" />}
            <div className="space-y-1">
              <Skeleton className={`h-16 ${i % 2 === 0 ? 'w-64' : 'w-48'} rounded-lg`} />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    </div>
  );
}
