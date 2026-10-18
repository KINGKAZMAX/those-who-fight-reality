// Run only after creating the requested Design file and completing library discovery.
// figma-use, figma-generate-design, figma-generate-library must be loaded.
const existing = figma.currentPage.children.find(n => n.name === "失物招领局 / 全览审阅板");
if (existing) return { status: "exists", wrapperId: existing.id, pageId: figma.currentPage.id, children: existing.children?.length || 0 };
const page = figma.currentPage;
page.name = "01 审阅板｜提案与资产";
const maxX = page.children.reduce((m, n) => Math.max(m, n.x + n.width), 0);
const wrapper = figma.createAutoLayout("VERTICAL");
wrapper.name = "失物招领局 / 全览审阅板";
wrapper.resize(2960, 100);
wrapper.layoutSizingHorizontal = "FIXED";
wrapper.layoutSizingVertical = "HUG";
wrapper.itemSpacing = 80;
wrapper.fills = [];
wrapper.x = maxX + 200;
wrapper.y = 200;
return { status: "created", createdNodeIds: [wrapper.id], mutatedNodeIds: [page.id], wrapperId: wrapper.id, pageId: page.id, width: wrapper.width };
