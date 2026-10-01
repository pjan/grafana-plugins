// Grafana's Icon loads its SVG files with react-inlinesvg, which fetches them. In tests, an empty <svg> named after the
// icon stands in for it (as in the create-plugin scaffold's .config/jest/mocks), so failed fetches stay out of the
// console.
const InlineSVG = ({ src }: { src: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" data-testid={src.replace(/(.+)\/(.+)\.svg$/, '$2')} viewBox="0 0 24 24" />
);

export default InlineSVG;
