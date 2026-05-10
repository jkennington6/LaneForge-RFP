type BrandLogoProps = {
  variant?: "full" | "icon";
  className?: string;
};

export function BrandLogo({ variant = "full", className = "" }: BrandLogoProps) {
  if (variant === "icon") {
    return (
      <img
        src="/brand/laneforge-icon.svg"
        alt="LaneForge RFP"
        className={`object-contain ${className}`}
      />
    );
  }

  return (
    <img
      src="/brand/laneforge-logo.svg"
      alt="LaneForge RFP"
      className={`object-contain ${className}`}
    />
  );
}
