import { Suspense } from "react";
import EventosFilters from "./EventosFilters";

type Props = React.ComponentProps<typeof EventosFilters>;

export default function EventosFiltersSuspense(props: Props) {
  return (
    <Suspense fallback={null}>
      <EventosFilters {...props} />
    </Suspense>
  );
}
