import { useId, type ReactNode } from 'react';
import type { CustomerProfile } from '@/lib/api/types';
import { Card, CardContent, CardHeader, CardTitle, DescriptionList } from '@/components/ui/primitives';
import { KycBadge } from './badges';
import { formatCalendarDate, formatDate, formatDateTime } from './format';

const notProvided = <span className="text-muted-foreground">Not provided</span>;

export function ProfileCard({ profile, children }: { profile: CustomerProfile; children?: ReactNode }) {
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>Profile</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 sm:pt-0">
        <DescriptionList
          items={[
            { label: 'Full name', value: profile.fullName },
            { label: 'Phone', value: <span className="tnum">{profile.phoneNumber}</span> },
            { label: 'Date of birth', value: profile.dateOfBirth ? formatCalendarDate(profile.dateOfBirth) : notProvided },
            { label: 'Address', value: profile.address ? <span className="whitespace-pre-line">{profile.address}</span> : notProvided },
            { label: 'KYC status', value: <KycBadge status={profile.kycStatus} /> },
            {
              label: 'Profile version',
              value: (
                <span className="flex flex-col">
                  <span className="tnum">Version {profile.version}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    Changes whenever the customer edits their details. A KYC decision applies to one exact version.
                  </span>
                </span>
              ),
            },
            { label: 'Customer since', value: formatDate(profile.createdAt) },
            { label: 'Last updated', value: <time dateTime={profile.updatedAt}>{formatDateTime(profile.updatedAt)}</time> },
          ]}
        />
      </CardContent>
      {children}
    </Card>
  );
}
