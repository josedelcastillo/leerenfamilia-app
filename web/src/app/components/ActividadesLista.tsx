import type { Activity } from '../../shared/api.ts';
import { KIND_LABEL } from '../formato.ts';

/** The week's activities as 56px rows, each with its type on the right (screens 2 and 5). */
export function ActividadesLista({
  activities,
  onOpen,
}: {
  activities: readonly Activity[];
  onOpen: (activity: Activity) => void;
}) {
  return (
    <ul className="actividades">
      {activities.map((activity) => (
        <li key={activity.id}>
          <button type="button" onClick={() => onOpen(activity)}>
            <span>{activity.title}</span>
            <span className="actividades__tipo">{KIND_LABEL[activity.kind]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
