import { parseLibrary } from './library'

export const sampleLibrary = parseLibrary({
  groups: [{ id: 'samples', name: '上手示例', order: 0 }],
  snippets: [
    '你好，已收到你的消息，我会尽快回复。',
    '感谢反馈！请提供操作步骤和软件版本，方便进一步排查。',
    '今天的进展已更新，有需要协助的地方请随时联系。',
    '请将以下内容改写得清晰、简洁，保留事实和原意：',
    '请把以下任务整理成待办清单，注明负责人和截止时间：',
    '这是我的第一条快捷输入，剪贴板里的内容依然保留。'
  ].map((content, order) => ({ id: `sample-${order}`, content, groupId: 'samples', order, favorite: false }))
})
