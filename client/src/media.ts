/**
 * Single source of truth for the page's imagery.
 *
 * The frames currently hold on-brand editorial artwork (see
 * `client/public/media/*.svg`). To use real photography, drop the file into
 * `client/public/media/` and change `src` and `alt` here — nothing else in the
 * app references these paths directly.
 */

export interface Media {
  src: string;
  alt: string;
}

/** Brand seal: doubles as the header/footer mark and the favicon. */
export const seal: Media = {
  src: "/media/for-all-moms-seal.svg",
  // Decorative — the wordmark beside it already names the brand.
  alt: "",
};

export const heroPhoto: Media = {
  src: "/media/for-all-moms-hero.svg",
  alt: "Illustration of three people of different generations gathered around a sunlit kitchen table set with tea and flowers",
};

export const windowPhoto: Media = {
  src: "/media/for-all-moms-window.svg",
  alt: "Illustration of two people assembling a memory album at a table beside a bright window",
};

export const handsPhoto: Media = {
  src: "/media/for-all-moms-hands.svg",
  alt: "Illustration of hands writing a note and arranging cut flowers on a wooden table",
};
