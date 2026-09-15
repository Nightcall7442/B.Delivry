/**
 * Tabs props.
 *
 */
export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  'aria-label'?: string;
}
