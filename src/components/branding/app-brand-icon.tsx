type AppBrandIconProps = {
  iconUrl: string;
};

export function AppBrandIcon({ iconUrl }: AppBrandIconProps) {
  return (
    <span className="relative grid size-9 place-items-center overflow-hidden rounded-lg bg-orange-600 text-sm font-black text-white shadow-[0_0_0_4px_rgba(249,115,22,0.13)]">
      <span aria-hidden="true">I</span>
      <Image
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover"
        height={36}
        src={iconUrl}
        unoptimized
        width={36}
      />
    </span>
  );
}
import Image from "next/image";
