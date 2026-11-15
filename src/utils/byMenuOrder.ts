/** Menu ordering shared by CMS pages and rubrics: `menuOrder`, then title. */
const byMenuOrder = (
  a: { data: { menuOrder: number; title: string } },
  b: { data: { menuOrder: number; title: string } }
) =>
  a.data.menuOrder - b.data.menuOrder ||
  a.data.title.localeCompare(b.data.title);

export default byMenuOrder;
