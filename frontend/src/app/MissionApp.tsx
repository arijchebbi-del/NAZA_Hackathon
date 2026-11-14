import MainSimulation from "../main/MainSimulation";

interface MissionAppProps {
  onBack?: () => void;
}

export default function MissionApp({ onBack }: MissionAppProps) {
  return <MainSimulation onBack={onBack} />;
}
