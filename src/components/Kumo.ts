import { applyPureReactInVue } from 'veaury'
import { Button, Input, LayerCard, Dialog } from '@cloudflare/kumo'

export const KumoButton = applyPureReactInVue(Button)
export const KumoInput = applyPureReactInVue(Input)
export const KumoLayerCard = applyPureReactInVue(LayerCard)
export const KumoDialog = applyPureReactInVue(Dialog)
