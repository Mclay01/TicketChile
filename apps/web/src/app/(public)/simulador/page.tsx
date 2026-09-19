import {PageHeading} from '@/components/tc/ui';
import Simulator from '@/components/ai/Simulator';
import {providerStatus} from '@/lib/ai/provider.server';
export const dynamic='force-dynamic';
export default function SimulatorPage(){return <div className="page"><PageHeading eyebrow="TicketChile AI / Para organizadores" title="Dale forma a tu próxima idea">De una descripción a una propuesta que puedes revisar.</PageHeading><Simulator status={providerStatus()}/></div>;}
