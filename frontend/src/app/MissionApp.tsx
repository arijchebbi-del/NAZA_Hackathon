import App from "../App.tsx";

interface MissionAppProps {
  onBack?: () => void;
}

export default function MissionApp({ onBack }: MissionAppProps) {
  return <App onBack={onBack} />;
}
