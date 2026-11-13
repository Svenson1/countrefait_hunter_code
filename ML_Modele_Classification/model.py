"""CounterfeitCNN architecture, shared by the training script and the web app.

The code below is copied unchanged from counterfeit_cnn.py so that the app can
rebuild the network without importing the training/data pipeline.
Do not change it: saved checkpoints only load into this exact architecture.
"""
import torch
from torch import nn


def conv_block(in_channels: int, out_channels: int) -> nn.Sequential:
    """Build one convolutional block: Conv -> BatchNorm -> ReLU -> MaxPool.

    - Conv2d (3x3, padding 1): learns `out_channels` local filters. The bias
      is disabled because BatchNorm already has a learnable shift.
    - BatchNorm2d: normalizes each channel; stabilizes and speeds up training.
    - ReLU: non-linearity, so stacked layers can learn complex functions.
    - MaxPool2d(2): halves height and width, keeping the strongest responses.

    Args:
        in_channels: Number of input channels (feature maps).
        out_channels: Number of filters, i.e. output channels.

    Returns:
        The block as an nn.Sequential.
    """
    return nn.Sequential(
        nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
        nn.BatchNorm2d(out_channels),
        nn.ReLU(inplace=True),
        nn.MaxPool2d(2),
    )


class CounterfeitCNN(nn.Module):
    """Compact CNN for genuine vs. counterfeit classification.

    Architecture (default: 4 blocks, 32 base filters, input 3 x 384 x 384):

        Block 1: 3   -> 32  filters, output  32 x 192 x 192
        Block 2: 32  -> 64  filters, output  64 x  96 x  96
        Block 3: 64  -> 128 filters, output 128 x  48 x  48
        Block 4: 128 -> 256 filters, output 256 x  24 x  24
        Global average pooling       -> 256 values
        Dropout + Linear             -> 2 class scores (logits)

    Each block halves the spatial size and doubles the number of filters.
    With the defaults the model has about 0.39 million parameters.

    Receptive field: each of the 256 final features "sees" a window of about
    46 x 46 input pixels (about 94 x 94 with 5 blocks). Global average pooling
    then averages these local features over the whole image, so the model
    judges local texture rather than the overall layout of the note - and the
    background contributes to the average as well.

    Args:
        num_classes: Number of output classes.
        base_filters: Filters in the first block (doubled at every block).
        num_blocks: Number of convolutional blocks.
        dropout: Probability of zeroing a feature before the classifier
            (training only).
    """

    def __init__(self, num_classes: int = 2, base_filters: int = 32,
                 num_blocks: int = 4, dropout: float = 0.4) -> None:
        super().__init__()
        channels = [3] + [base_filters * 2 ** i for i in range(num_blocks)]
        self.features = nn.Sequential(
            *[conv_block(channels[i], channels[i + 1]) for i in range(num_blocks)]
        )
        self.pool = nn.AdaptiveAvgPool2d(1)  # one value per feature map
        self.dropout = nn.Dropout(dropout)
        self.classifier = nn.Linear(channels[-1], num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Compute class scores.

        Args:
            x: Batch of images, shape (N, 3, H, W).

        Returns:
            Logits of shape (N, num_classes).
        """
        x = self.features(x)
        x = self.pool(x).flatten(1)
        x = self.dropout(x)
        return self.classifier(x)
